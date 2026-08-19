import { DurableObject } from "cloudflare:workers";
import typia, { tags } from "typia";
import { getInboxPublicEncryptionKey, postEncryptedInboxItem, encrypt, InboxItemSchema } from "../nn-inbox-cloudflare-workers/src/index"

interface KeyRequest {
	server?: string,
	apikey: string
}

type NoteOptions = {
	notebookIds?: string[],
	tagIds?: string[],
	archived?: boolean,
	readonly?: boolean,
	pinned?: boolean,
	favorite?: boolean,
	title: string & tags.MinLength<1>,
}

interface UserOptions {
	note: NoteOptions,
	server?: string,
	apikey: string
}

type StoredData = {
	note: NoteOptions,
	server?: string,
	apikey: string,
	fromDate: number,
	userTimezone: string,
	compressed?: boolean
}

interface UserData {
	options: UserOptions,
	content: string,
	toDate: number,
}

function requireDebugAuth(request: Request, env: Env): Response | null {
	const secret = env.DEBUG_AUTH_SECRET
	if (!secret) {
		return new Response("Debug endpoints are disabled.", { status: 503 })
	}

	if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
		return new Response("Unauthorized", {
			status: 401,
			headers: { "WWW-Authenticate": "Bearer" },
		})
	}

	return null
}

function resolveServer(server: string | undefined, fallback: string): string | null {
	const value = (server ?? fallback).trim()
	if (!value) return null

	try {
		const parsed = new URL(value)
		if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
			return null
		}
		return parsed.toString().replace(/\/+$/, "")
	} catch {
		return null
	}
}

export class notesnookFromThePast extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
	}

	async DUMP() {
		let html: ArrayBuffer | string | undefined = await this.ctx.storage.get("note")
		if (html instanceof ArrayBuffer) {
			try {
			const decompress = new Response(html).body!.pipeThrough(new DecompressionStream("gzip"))
			html = await new Response(decompress).text()
			} catch (err) {
				console.error("Error uncompressing note content in debug function. Likely corrupt?: ", err)
				html = ""
			}
		}
		const data = await this.ctx.storage.get("data")
		const alarm = await this.ctx.storage.getAlarm();
		return {
			html: html,
			metadata: data,
			alarm: alarm
		}
	}

	async getDBSize() {
		const bytes = this.ctx.storage.sql.databaseSize
		const alarm = await this.ctx.storage.getAlarm()
		return {size: bytes, alarm: alarm}
	}

	async hardDelete() {
		await this.ctx.storage.deleteAll()
		return true
	}

	async createDO(data: UserData, timezone: string, rawBytes: Uint8Array) {
		const { options } = data;
		const safeOptions: StoredData = {
			...options,
			fromDate: Date.now(),
			userTimezone: timezone,
			compressed: true,
			}
		const readableCompressedStream = new Response(rawBytes).body!.pipeThrough(new CompressionStream("gzip"))
		const arrBuff = await new Response(readableCompressedStream).arrayBuffer()
		try {
			await this.ctx.storage.put("note", arrBuff)
			await this.ctx.storage.put("data", typia.json.assertStringify<StoredData>(safeOptions))
			await this.ctx.storage.setAlarm(data.toDate)
		} catch (err) {
			// delete everything to avoid invalid state
			console.error(err)
			await this.ctx.storage.deleteAll()
			// propagate upwards
			throw err
		}
	}

	private async sendNote() {
		const data: string | undefined = await this.ctx.storage.get<string>("data")
		const noteData: string | ArrayBuffer | undefined = await this.ctx.storage.get<string | ArrayBuffer>("note")
		if (data === undefined || noteData === undefined) {
			console.log("I'm corrupt?")
			await this.ctx.storage.deleteAll()
			return
		}
		const parsedData = typia.json.assertParse<StoredData>(data)
		let finalNoteHTML: string;
		const server = resolveServer(parsedData.server, this.env["Notesnook-Server-Url"])
		if (!server) {
			await this.ctx.storage.deleteAll()
			return
		}
		const publicKey = await getInboxPublicEncryptionKey(parsedData.apikey, server)
		if (!publicKey) {
			// never deliverable, apikey invalid
			await this.ctx.storage.deleteAll()
			return
		}
		if (parsedData.compressed) {
			if (!(noteData instanceof ArrayBuffer)) {
				console.error("Compressed payload is not ArrayBuffer")
				await this.ctx.storage.deleteAll();
				return;
			}
			try {
				const decompressionResult = new Response(noteData).body!.pipeThrough(new DecompressionStream("gzip"))
				if (!decompressionResult) {
					await this.ctx.storage.deleteAll();
					console.error("Damaged Compressed Stream")
					return
				}
				finalNoteHTML = await new Response(decompressionResult).text()
			} catch(err) {
				console.error("Giving up:", err)
				await this.ctx.storage.deleteAll();
				return;
			}
		} else {
			if (typeof noteData !== "string"){
				console.error("Somehow I ended up here. I really should not be here.")
				await this.ctx.storage.deleteAll()
				return
			}
			finalNoteHTML = noteData
		}
		const note: InboxItemSchema = {
			title: parsedData.note.title,
			archived: parsedData.note.archived,
			favorite: parsedData.note.favorite,
			readonly: parsedData.note.readonly,
			pinned: parsedData.note.pinned,
			notebookIds: parsedData.note.notebookIds,
			tagIds: parsedData.note.tagIds,
			source: `You from the past on ${new Date(parsedData.fromDate).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: parsedData.userTimezone})}`,
			version: 1,
			content: {
				type: "html",
				data: finalNoteHTML
			},
			type: "note"
		}
		const message = await encrypt(typia.json.assertStringify<InboxItemSchema>(note), publicKey)
		await postEncryptedInboxItem(parsedData.apikey, message, server)
		// if the below fails, we'll end up sending it twice.
		// there's no way around it.
		await this.ctx.storage.deleteAll()
	}

	async alarm(alarmInfo: AlarmInvocationInfo) {
		try {
			await this.sendNote()
		} catch (err) {
			const attempts = await this.ctx.storage.get<number>("attempts") ?? 0
			console.error("Failed to deliver:", err)
			if (attempts >= 6) {
				await this.ctx.storage.deleteAll()
				console.error("Exhausted max attempts. Giving up.")
				return
			} else {
				await this.ctx.storage.put("attempts", attempts + 1)
				const now = Date.now() + (40 * 1000 * (attempts + 1))
				await this.ctx.storage.setAlarm(now)
			}
		}
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		if (request.method === "POST") {
			if (url.pathname === "/api/key") {
				const data = typia.json.validateParse<KeyRequest>(await request.text())
				if (data.success) {
					const apikey = data.data.apikey
					const server = resolveServer(data.data.server, env["Notesnook-Server-Url"])
					if (!server) {
						return new Response(null, { status: 400 })
					}
					const key = await getInboxPublicEncryptionKey(apikey, server)
					if (!key) {
						return new Response(null, {status: 401})
					}
					return new Response(null, {status: 200})
				} else {
					return new Response(null, { status: 400 })
				}
			}
			if (url.pathname !== "/api") {
				return new Response(null, { status: 404 })
			}
			const id = env.NOTESNOOK_FROM_THE_PAST.newUniqueId()
			const stub = env.NOTESNOOK_FROM_THE_PAST.get(id)
			let data: UserData
			const timezone = request.cf?.timezone ?? "UTC"
			const now = new Date()
			const maxYear = new Date(now.getFullYear() + Number(env.YEARS), 11, 31, 23, 59, 59, 999).getTime()
			try {
				data = typia.json.assertParse<UserData>(await request.text())
			} catch (err) {
				console.log(err)
				return new Response(String(err), { status: 400 })
			}
			if (data.toDate > maxYear || now.getTime() > data.toDate) {
				return new Response(null, {status: 400})
			}
			const stringToBytes = new TextEncoder().encode(data.content)
			// DOs can only store ~2MiB per key, this check is actually very ambitious
			// I don't want to have to update the worker if the size gets increased
			// by a non significant amount.
			if (stringToBytes.byteLength > 4_000_000) {
				// return 413 for content that's definitely way too large.
				return new Response(null, {status: 413})
			}
			const server = resolveServer(data.options.server, env["Notesnook-Server-Url"])
			if (!server) {
				return new Response(null, { status: 400 })
			}
			if (data.options.server !== undefined) {
				data.options.server = server
			}
			const publicKey = await getInboxPublicEncryptionKey(data.options.apikey, server)
			if (!publicKey) {
				return new Response(null, { status: 401 })
			}
			const ip = request.headers.get("CF-Connecting-IP")

			if (!ip) {
				return new Response("Unable to determine IP", { status: 400 })
			}
			try {
				const yes = await env.PUBLISHED_DO.limit({key: ip})
				if (!yes.success) {
					return new Response("Ratelimited", {status: 429})
				}
				await stub.createDO(data, timezone, stringToBytes)
			} catch (err) {
				if (err instanceof Error) {
					if (err.message.endsWith("SQLITE_TOOBIG")){
						// most likely case is that the blob was just too big.
						return new Response(null, { status: 413 })
					}
				}
				console.error(err)
				return new Response(null, { status: 400 })
			}
			return new Response(null, { status: 204 })
		}

		if (request.method === "GET" && url.pathname === "/api/size") {
			const authResponse = requireDebugAuth(request, env)
			if (authResponse) return authResponse

			const id = url.searchParams
			const DOid = id.get("DO")
			if (!DOid) {
				return new Response("", {status: 404})
			}
			const _stub = env.NOTESNOOK_FROM_THE_PAST.idFromString(DOid)
			const stub = env.NOTESNOOK_FROM_THE_PAST.get(_stub)

			const bytes = await stub.getDBSize()
			return Response.json(bytes)
		}
		if (request.method === "GET" && url.pathname === "/api/harddelete") {
			const authResponse = requireDebugAuth(request, env)
			if (authResponse) return authResponse

			const yes = await env.PUBLISHED_DO.limit({key: "DEBUG_GLOBALKEY_DELETE"})
			if (!yes.success) {
				return Response.json({}, {status: 429})
			}
			const id = url.searchParams
			const DOid = id.get("DO")
			if (!DOid) {
				return new Response("", {status: 404})
			}
			const _stub = env.NOTESNOOK_FROM_THE_PAST.idFromString(DOid)
			const stub = env.NOTESNOOK_FROM_THE_PAST.get(_stub)
			const bytes = await stub.hardDelete()
			return Response.json({result: bytes})
		}
		if (request.method === "GET" && url.pathname === "/api/dump") {
			const authResponse = requireDebugAuth(request, env)
			if (authResponse) return authResponse

			const yes = await env.PUBLISHED_DO.limit({key: "DEBUG_GLOBALKEY_DUMP"})
			if (!yes.success) {
				return Response.json({}, {status: 429})
			}
			const id = url.searchParams
			const DOid = id.get("DO")
			if (!DOid) {
				return new Response("", {status: 404})
			}
			const _stub = env.NOTESNOOK_FROM_THE_PAST.idFromString(DOid)
			const stub = env.NOTESNOOK_FROM_THE_PAST.get(_stub)
			return Response.json(await stub.DUMP())
		}
		return new Response('Hello World!', { status: 405 });
	},
} satisfies ExportedHandler<Env>;
