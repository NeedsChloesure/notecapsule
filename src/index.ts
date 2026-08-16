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
	userTimezone: string
}

interface UserData {
	options: UserOptions,
	content: string,
	toDate: number,
}

export class notesnookFromThePast extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
	}

	async DUMP() {
		const html = await this.ctx.storage.get("note")
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

	async createDO(data: UserData, timezone: string) {
		const { options, content } = data;
		const safeOptions: StoredData = {
			...options,
			fromDate: Date.now(),
			userTimezone: timezone,
			}
		try {
			await this.ctx.storage.put("note", content)
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
		const noteHtml: string | undefined = await this.ctx.storage.get<string>("note")
		if (data === undefined || noteHtml === undefined) {
			console.log("I'm corrupt?")
			await this.ctx.storage.deleteAll()
			return
		}
		const parsedData = typia.json.assertParse<StoredData>(data)
		const publicKey = await getInboxPublicEncryptionKey(parsedData.apikey, parsedData.server ?? this.env["Notesnook-Server-Url"])
		if (!publicKey) {
			// never deliverable, apikey invalid
			await this.ctx.storage.deleteAll()
			return
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
				data: noteHtml
			},
			type: "note"
		}
		const message = await encrypt(typia.json.assertStringify<InboxItemSchema>(note), publicKey)
		await postEncryptedInboxItem(parsedData.apikey, message, parsedData.server ?? this.env["Notesnook-Server-Url"])
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
					const server = data.data.server ?? env["Notesnook-Server-Url"]
					const key = await getInboxPublicEncryptionKey(apikey, server)
					if (!key) {
						return new Response(null, {status: 401})
					}
					return new Response(null, {status: 200})
				} else {
					return new Response(null, { status: 400 })
				}
			}
			const id = env.NOTESNOOK_FROM_THE_PAST.newUniqueId()
			const stub = env.NOTESNOOK_FROM_THE_PAST.get(id)
			let data: UserData
			const timezone = request.cf?.timezone ?? "UTC"
			const now = new Date()
			const maxYear = new Date(now.getFullYear() + 20, 11, 31, 23, 59, 59, 999).getTime()
			try {
				data = typia.json.assertParse<UserData>(await request.text())
			} catch (err) {
				console.log(err)
				return new Response(String(err), { status: 400 })
			}
			if (data.toDate > maxYear || now.getTime() > data.toDate) {
				return new Response(null, {status: 400})
			}
			if (data.content.length > 16_000_000) {
				// return 413 for content that's definitely way too large.
				return new Response(null, {status: 413})
			}
			const publicKey = await getInboxPublicEncryptionKey(data.options.apikey, data.options.server ?? env["Notesnook-Server-Url"])
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
				await stub.createDO(data, timezone)
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
			const id = url.searchParams
			const DOid = id.get("DO")
			if (!DOid) {
				return new Response("", {status: 404})
			}
			const _stub = env.NOTESNOOK_FROM_THE_PAST.idFromString(DOid)
			const stub = env.NOTESNOOK_FROM_THE_PAST.get(_stub)
			//const stub = env.NOTESNOOK_FROM_THE_PAST.get(DOid)
			const bytes = await stub.getDBSize()
			return Response.json(bytes)
		}
		if (request.method === "GET" && url.pathname === "/api/harddelete") {
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
