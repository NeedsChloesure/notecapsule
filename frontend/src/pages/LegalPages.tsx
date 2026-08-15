import { Link } from 'react-router'
import TextDisplay from '../components/TextDisplay'

const updatedAt = 'Last updated: August 14, 2026'
const contactEmail = 'contact@youwereneverhere.fyi'

export function TermsOfService() {
  return (
    <TextDisplay
      title="Terms of Service"
      description="The rules for using NoteCapsule to schedule notes for delivery through Notesnook."
      updatedAt={updatedAt}
      content={
        <>
          <h2>Acceptance of Terms</h2>
          <p>
            By using NoteCapsule, you agree to these Terms of Service and
            confirm that you have read and understand them. If you do not agree
            to these terms, do not use the service.
          </p>

          <h2>The Service</h2>
          <p>
            NoteCapsule allows you to write a note, choose note options, and
            request delivery to a configured Notesnook server at a future date.
          </p>
          <p>
            NoteCapsule may change as it is developed. New or changed features
            may be subject to these terms and may be documented on this page.
          </p>

          <h2>User Responsibilities</h2>
          <p>
            You are responsible for keeping your Inbox API key and any
            configured server details private and secure. Treat your API key as
            a password. The key is used to authenticate with Notesnook and to
            deliver notes on your behalf; someone who obtains it may be able to
            create notes in your account or submit deliveries through the
            service.
          </p>
          <p>
            You are responsible for all note titles, content, images, tags,
            notebook IDs, note attributes, and delivery dates that you submit.
            You agree not to use NoteCapsule to harass, intimidate, abuse, or
            harm another person, to send unlawful or infringing content, or to
            violate applicable laws or the rights of others.
          </p>
          <p>
            You must only use an API key and Notesnook account that you are
            authorized to use. The Notesnook service may apply its own limits
            and terms to notes created through NoteCapsule. If you use the
            official Notesnook service, you can review its{' '}
            <a href="https://notesnook.com/terms">Terms of Service</a>.
          </p>

          <h2>Scheduled Delivery</h2>
          <p>
            After a delivery request is accepted, the service temporarily
            stores the information needed to deliver that note at the requested
            time. Delivery may be delayed, retried, rejected, or lost because
            of failures involving NoteCapsule, Cloudflare, Notesnook, your API
            key, the configured server, or the network.
          </p>
          <p>
            Successful delivery is not guaranteed. Do not use NoteCapsule as
            the sole copy of an important document, as an emergency alert, or
            for any situation where a missed or delayed note could cause harm.
          </p>

          <h2>Availability of Services</h2>
          <p>
            There is no guarantee that NoteCapsule will always be available or
            that it will remain unchanged. The service may be modified,
            suspended, or discontinued at any time, with or without notice.
            Scheduled deliveries may be removed or fail if the service is
            unavailable or if processing cannot be completed.
          </p>

          <h2>No Warranty</h2>
          <p>
            NoteCapsule is provided without warranties, express or implied. An
            effort is made to keep the service reliable, but unexpected errors,
            data loss, security incidents, and failed or delayed deliveries may
            occur.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, I am not liable for lost or
            altered notes, failed or delayed deliveries, loss of data, loss of
            access, or other damages resulting from your use of NoteCapsule or
            from a third-party service used to operate or receive deliveries.
            Nothing in these terms limits liability that cannot legally be
            limited.
          </p>

          <h2>Termination</h2>
          <p>
            You may stop using NoteCapsule at any time and should revoke your
            API key through Notesnook if you believe it has been exposed. Access
            to the service may also be terminated or restricted at any time,
            with or without reason or notice. Temporary records for scheduled
            deliveries are removed after successful delivery, after an
            unrecoverable failure, or when the operator removes them, as
            described in the <Link to="/privacy">Privacy Policy</Link>.
          </p>

          <h2>Privacy</h2>
          <p>
            Please read the <Link to="/privacy">Privacy Policy</Link> for
            information about what NoteCapsule stores, processes, and shares.
          </p>

          <h2>Updates and Changes</h2>
          <p>
            The latest version of these terms will be available on this page.
            These terms may be updated from time to time to reflect changes to
            the service or applicable law. Continued use of NoteCapsule after
            an update means that you accept the updated terms.
          </p>

          <h2>A Few Last Notes</h2>
          <h3>Scheduled delivery is not guaranteed</h3>
          <p>
            A scheduled note is a request, not a promise of delivery. Verify
            that important notes have arrived in Notesnook before treating them
            as received, and keep another copy of important information.
          </p>

          <h3>API keys</h3>
          <p>
            The API key authenticates requests to Notesnook and allows the
            service to obtain the public encryption key and deliver a note on
            your behalf. Never use another person&apos;s key without their
            permission.
          </p>

          <h3>Not affiliated with Notesnook</h3>
          <p>
            NoteCapsule is an independent community project. It is not
            affiliated with or endorsed by the Notesnook project or Streetwriters
            (Private) Ltd., the company behind Notesnook. The name Notesnook is
            used to describe compatibility with that service.
          </p>

          <h2>Contact</h2>
          <p>
            Questions, feedback, or requests about this service can be sent to{' '}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. You may also
            reach me in the{' '}
            <a href="https://go.notesnook.com/discord">Notesnook Discord</a>;
            my username there is &quot;poang.&quot; (the period is part of the
            username).
          </p>
        </>
      }
    />
  )
}

export function PrivacyPolicy() {
  return (
    <TextDisplay
      title="Privacy Policy"
      description="What NoteCapsule stores, for approximately how long, and why it is needed to schedule a note."
      updatedAt={updatedAt}
      content={
        <>
          <p>
            This policy describes the information processed by NoteCapsule when
            you compose and schedule a note. It is written for this deployment
            and should be reviewed if the operator, infrastructure, retention
            settings, or configured Notesnook server changes.
          </p>

          <h2>Data Stored in Your Browser</h2>
          <p>
            While you are composing a note, the browser may store your API key,
            API server setting, note title, note content, tags, notebook IDs,
            and note attributes in session storage so the editor can preserve
            your draft during the current browser session. All of these values, 
            excluding your server configuration and API key, are removed when 
            the note is successfully submitted or when the draft is cleared.
            Browser session and storage behavior is controlled by your
            browser, so you can also remove this data by clearing the
            site&apos;s storage.
          </p>
          <p>
            Images added to a draft are stored in the browser&apos;s IndexedDB
            storage while the draft needs them. Before delivery, those images
            are included in the note content sent to the service. Images are
            cleared with the draft after a successful submission or when the
            application clears its local data.
          </p>

          <h2>Data Stored for a Scheduled Delivery</h2>
          <p>
            To deliver a scheduled note, the service temporarily stores the
            API key, the configured Notesnook server, note title and options,
            note content, the time the request was created, and the timezone
            associated with the request. The scheduled delivery time is also
            used by the hosting platform to run the delivery attempt.
          </p>
          <p>
            This service does not create a long-term user record, and it is not
            possible to cancel a delivery after it is scheduled. User data is 
            removed once the delivery is successful, or has been attempted multiple
            times without success. No sensitive data, like your note contents,
            apikey, or other note data is logged when a delivery fails. The server 
            only logs that the delivery has failed. 
          </p>

          <h2>Data That May Be Stored, but Usually Is Not</h2>
          <p>
            If a request or delivery causes an unexpected error, metadata about
            the request or failure may be included in application logs. This
            may include information needed to investigate the failure and is
            expected to be retained for approximately one week. I do not deeply
            inspect these logs unless actively debugging a problem.
          </p>
          <p>
            During active debugging, note content or other request details may
            be temporarily retained for troubleshooting. Such data is expected
            to be retained for approximately one week, after which it should be
            removed according to the hosting platform&apos;s log-retention
            behavior.
          </p>

          <h2>Data That Is Processed and Then Removed</h2>
          <p>
            Note content, including embedded images and other data represented
            in that content, is retained by the service only while it is needed
            to wait for and attempt the scheduled delivery. After a successful
            delivery, the temporary delivery record is deleted. If the API key
            is invalid or delivery exhausts the available retry attempts, the
            temporary record is also deleted rather than retained indefinitely.
          </p>
          <p>
            A delivered note is stored by the configured Notesnook server and
            is then subject to that provider&apos;s storage and privacy practices.
            NoteCapsule cannot control or delete a note after it has been
            delivered to that server.
          </p>

          <h2>Retention of Data</h2>
          <p>
            Temporary delivery data is intended to exist only from the time a
            schedule request is accepted until successful delivery or final
            failure. A delivery may remain temporarily available longer than
            expected if the hosting platform is retrying a transient failure.
            Records are not intended to be retained for longer than necessary
            to process the scheduled note.
          </p>
          <p>
            Browser draft data remains until the draft is submitted, cleared,
            the browser session ends, or you remove the site&apos;s storage.
            Actual retention can also depend on browser behavior and the
            hosting platform&apos;s operational logs.
          </p>

          <h2>Third-Party Services</h2>
          <p>
            This service is hosted using Cloudflare&apos;s developer platform.
            Cloudflare processes data as part of providing the Workers,
            Durable Objects, scheduling, networking, and logging infrastructure
            used to operate NoteCapsule. Cloudflare may process or temporarily
            retain request metadata such as timing, IP address, user agent, and
            other operational information. I do not control Cloudflare&apos;s
            retention practices. For more information, see the{' '}
            <a href="https://www.cloudflare.com/privacypolicy/">
              Cloudflare Privacy Policy
            </a>.
          </p>
          <p>
            The default configuration forwards notes to the official Notesnook
            service. If you configure a different Notesnook-compatible server,
            that server will receive the delivery request instead. Notes
            delivered through the official service are subject to the{' '}
            <a href="https://notesnook.com/privacy">Notesnook Privacy Policy</a>.
          </p>

          <h2>Security of Data</h2>
          <p>
            The API key is stored temporarily because it is required to validate
            the request, obtain the Notesnook public encryption key, and
            authenticate delivery. It is not possible to perform the scheduled
            delivery without it.
          </p>
          <p>
            Note content is processed by the service while it waits for the
            scheduled time. It is encrypted before it is sent to the configured
            Notesnook inbox endpoint. This means the service must be trusted to
            process and store the note before the delivery; no service can
            guarantee absolute security.
          </p>
          <p>
            Reasonable measures are taken to protect stored data, but browser
            storage, networks, Cloudflare, Notesnook, and other third-party
            services can never be guaranteed completely secure.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            The latest version of this Privacy Policy will always be available
            on this page. It may be updated from time to time, without notice,
            to reflect changes to NoteCapsule or applicable law.
          </p>

          <h2>Contacting the Developer</h2>
          <p>
            Questions about this policy or requests relating to this service
            can be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            You may also reach me in the{' '}
            <a href="https://go.notesnook.com/discord">Notesnook Discord</a>;
            my username there is &quot;poang.&quot; (the period is part of the
            username).
          </p>
        </>
      }
    />
  )
}
