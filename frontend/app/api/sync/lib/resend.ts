import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a notification email using Resend.
 * Requires RESEND_API_KEY in environment.
 */
export async function sendNotificationEmail(to: string, subject: string, body: string) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Resend] Skipping email send: RESEND_API_KEY is not defined');
        return;
    }

    try {
        const { data, error } = await resend.emails.send({
            from: 'MercSync <notifications@mercsync.com>', // User needs to verify domain in Resend
            to: [to],
            subject: subject,
            html: body,
        });

        if (error) {
            console.error('[Resend] Error sending email:', error);
            return { success: false, error };
        }

        return { success: true, data };
    } catch (err) {
        console.error('[Resend] Fatal error:', err);
        return { success: false, error: err };
    }
}

/**
 * Build HTML template for notifications
 */
export function buildNotificationHtml(title: string, message: string, actionUrl?: string | null) {
    return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 12px;">
            <h1 style="color: #111; font-size: 20px; margin-bottom: 12px;">${title}</h1>
            <p style="color: #444; font-size: 16px; line-height: 1.5;">${message}</p>
            ${actionUrl ? `
                <div style="margin-top: 24px;">
                    <a href="${actionUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        View in Dashboard
                    </a>
                </div>
            ` : ''}
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="color: #888; font-size: 12px;">Sent by MercSync</p>
        </div>
    `;
}
