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

// ─── Notification Type Config ──────────────────
type NotificationType = 'stock_zero' | 'sync_failed' | 'oversell_risk' | 'token_expiring';

const NOTIFICATION_CONFIG: Record<NotificationType, {
    emoji: string;
    accentColor: string;
    accentBg: string;
    iconBg: string;
    ctaColor: string;
    ctaText: string;
}> = {
    stock_zero: {
        emoji: '🚨',
        accentColor: '#dc2626',
        accentBg: '#fef2f2',
        iconBg: '#fee2e2',
        ctaColor: '#dc2626',
        ctaText: 'View Inventory'
    },
    sync_failed: {
        emoji: '⚠️',
        accentColor: '#d97706',
        accentBg: '#fffbeb',
        iconBg: '#fef3c7',
        ctaColor: '#d97706',
        ctaText: 'View Details'
    },
    oversell_risk: {
        emoji: '📉',
        accentColor: '#2563eb',
        accentBg: '#eff6ff',
        iconBg: '#dbeafe',
        ctaColor: '#2563eb',
        ctaText: 'View Inventory'
    },
    token_expiring: {
        emoji: '🔑',
        accentColor: '#7c3aed',
        accentBg: '#f5f3ff',
        iconBg: '#ede9fe',
        ctaColor: '#7c3aed',
        ctaText: 'Reconnect'
    }
};

/**
 * Build premium HTML email template for all notification types.
 */
export function buildNotificationHtml(
    title: string,
    message: string,
    actionUrl?: string | null,
    type?: string
) {
    const config = NOTIFICATION_CONFIG[(type as NotificationType) || 'oversell_risk'] || NOTIFICATION_CONFIG.oversell_risk;
    const year = new Date().getFullYear();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${title}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <!-- Wrapper -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <!-- Container -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto;">
                    
                    <!-- Logo -->
                    <tr>
                        <td align="center" style="padding-bottom: 28px;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 14px; padding: 10px 20px;">
                                        <span style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">⚡ MercSync</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Main Card -->
                    <tr>
                        <td>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);">
                                
                                <!-- Accent Bar -->
                                <tr>
                                    <td style="height: 4px; background: linear-gradient(90deg, ${config.accentColor}, ${config.accentColor}aa);"></td>
                                </tr>

                                <!-- Icon + Title -->
                                <tr>
                                    <td style="padding: 36px 36px 0 36px;">
                                        <table role="presentation" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="width: 48px; height: 48px; background-color: ${config.iconBg}; border-radius: 12px; text-align: center; vertical-align: middle; font-size: 22px; line-height: 48px;">
                                                    ${config.emoji}
                                                </td>
                                                <td style="padding-left: 16px;">
                                                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #111827; line-height: 1.3;">
                                                        ${title}
                                                    </h1>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <!-- Message -->
                                <tr>
                                    <td style="padding: 20px 36px 0 36px;">
                                        <div style="background-color: ${config.accentBg}; border-radius: 12px; padding: 16px 20px; border-left: 3px solid ${config.accentColor};">
                                            <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #374151;">
                                                ${message}
                                            </p>
                                        </div>
                                    </td>
                                </tr>

                                <!-- CTA Button -->
                                ${actionUrl ? `
                                <tr>
                                    <td style="padding: 28px 36px 0 36px;">
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td align="center">
                                                    <a href="${actionUrl}" target="_blank" style="display: inline-block; background-color: ${config.ctaColor}; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 10px; letter-spacing: 0.2px; box-shadow: 0 2px 8px ${config.ctaColor}33;">
                                                        ${config.ctaText} →
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>` : ''}

                                <!-- Timestamp -->
                                <tr>
                                    <td style="padding: 24px 36px 0 36px;">
                                        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                                            ${new Date().toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                                        </p>
                                    </td>
                                </tr>

                                <!-- Divider -->
                                <tr>
                                    <td style="padding: 24px 36px 0 36px;">
                                        <div style="height: 1px; background-color: #f3f4f6;"></div>
                                    </td>
                                </tr>

                                <!-- Help text -->
                                <tr>
                                    <td style="padding: 16px 36px 32px 36px;">
                                        <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                                            You're receiving this because you have email notifications enabled in your MercSync settings. 
                                            You can manage your notification preferences anytime from the 
                                            <a href="${actionUrl ? actionUrl.replace(/\/[^/]*$/, '/settings') : '#'}" style="color: ${config.accentColor}; text-decoration: none; font-weight: 500;">Settings</a> page.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 28px 20px;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                                Sent by <strong style="color: #6b7280;">MercSync</strong> — Multi-channel inventory sync
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 11px; color: #d1d5db;">
                                © ${year} MercSync. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}
