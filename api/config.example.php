<?php
/**
 * Copy this file to api/config.php on the SERVER and fill it in.
 *
 *   config.php is gitignored and denied by .htaccess. Never commit it, never
 *   paste a token into a README, a chat, a screenshot or a commit message.
 *   Real credentials belong on the production server and nowhere else.
 *
 * Until CONFIGURED is true, booking.php answers `status` with live:false and
 * refuses every other action. The site then runs its local preview and says on
 * the panel that requests are not being delivered. That is deliberate: a form
 * that silently drops a guest's booking is worse than one that admits it is not
 * ready.
 *
 * WHAT YOU NEED FROM META, AND WHY
 * --------------------------------
 * Both messages this site sends are business-initiated. Meta rejects free-form
 * text outside the 24-hour customer service window, and sending a verification
 * code as free text is grounds for suspending the WhatsApp account. So each one
 * is an approved template, and you need two of them. The exact bodies to submit
 * are written out below — paste them verbatim.
 */

return [

    // =======================================================================
    // Flip to true only once everything below is real and both templates are
    // APPROVED in Meta's template manager. Nothing else switches the site on.
    // =======================================================================
    'CONFIGURED' => false,

    // -----------------------------------------------------------------------
    // WhatsApp Cloud API
    // business.facebook.com -> your WhatsApp Business Account -> API Setup
    // -----------------------------------------------------------------------

    // Who RECEIVES booking requests. A LIST — the homestay is run by more than
    // one person, and every number here gets the same message. Each send is
    // recorded separately, so one unreachable number cannot lose the booking
    // for the other.
    // Digits only, country code included, no '+' and no spaces.
    // e.g. India 94486 47831 -> '919448647831'
    'OWNER_WHATSAPP_NUMBERS' => [
        // '919448647831',
        // '918861070431',
    ],

    // "Phone number ID" on the API Setup page. This is NOT the phone number —
    // it is a long numeric id belonging to the number that SENDS.
    'WA_PHONE_ID' => '',

    // A permanent System User access token with the whatsapp_business_messaging
    // and whatsapp_business_management permissions. The temporary 24-hour token
    // on the API Setup page is for testing only; it will expire mid-booking.
    'WA_TOKEN' => '',

    // Graph API version. Meta supports each for about two years:
    //   v21.0  ends 21 Jan 2027   <- do not start here
    //   v23.0  ends     Jan 2028
    //   v25.0  ends     Jul 2028  <- default, comfortable runway
    //   v26.0  current at time of writing
    // Bump it when the end date gets close; nothing else needs to change.
    'WA_API_VERSION' => 'v25.0',

    // -- Template 1: the owner's booking notification -----------------------
    // Category: UTILITY.  Language: English (en).
    // Submit this body EXACTLY, with seven variables:
    //
    //   New booking request from the Benaka By The Hills website.
    //
    //   Guest: {{1}}
    //   Coming from: {{2}}
    //   Phone: {{3}}
    //   WhatsApp: {{4}}
    //   Email: {{5}}
    //   Dates: {{6}}
    //   Received: {{7}}
    //
    //   Reply to this guest on WhatsApp to confirm the stay.
    //
    // Sample values Meta will ask for: Anjan Ganapathy / Bengaluru /
    // +919876543210 / +919876543210 / anjan@example.com /
    // 12 Oct 2026 to 15 Oct 2026 (3 nights) / 6 Sep 2026, 14:20
    //
    // Rules that make Meta reject a template: it must not begin or end with a
    // variable, and two variables must not sit next to each other. The body
    // above satisfies both. Values may not contain newlines — which is why the
    // line breaks live here, in the approved body, and not in the data.
    'WA_BOOKING_TEMPLATE'      => 'benaka_booking_request',
    'WA_BOOKING_TEMPLATE_LANG' => 'en',

    // -- Template 2: the guest's verification code --------------------------
    // Category: AUTHENTICATION.  Language: English (en).
    // You do not write this body — Meta supplies fixed preset text and you
    // choose the options. Create it with:
    //   * Code delivery: "Copy code"  (NOT one-tap autofill: that needs an
    //     Android app signing hash, which a website does not have)
    //   * Tick "Add security recommendation"
    //   * Tick "Add expiry time for the code" -> 10 minutes
    // Leave this blank and set OTP_CHANNEL to 'email' to launch before it is
    // approved. Approval usually takes minutes to a day.
    'WA_OTP_TEMPLATE'      => 'benaka_otp',
    'WA_OTP_TEMPLATE_LANG' => 'en',

    // How a send actually happens:
    //   'cloud'  the real Graph API                     <- production
    //   'log'    write the payload to DATA_DIR/wa-outbox.log and report success
    //            (used by tools/test.sh; also a safe staging mode)
    //   'off'    do not send at all, and say so honestly
    'WA_TRANSPORT' => 'cloud',
    'WA_TIMEOUT'   => 15,

    // -----------------------------------------------------------------------
    // How the guest's number is verified
    //   'whatsapp'  authentication template  (needs WA_OTP_TEMPLATE approved)
    //   'email'     a code by email          (no Meta approval, works day one)
    //   'off'       no verification step
    // -----------------------------------------------------------------------
    'OTP_CHANNEL'    => 'whatsapp',
    'OTP_EMAIL_FROM' => '',            // e.g. 'bookings@yourdomain.com' — only for 'email'

    'OTP_TTL_SECONDS'  => 600,         // ten minutes; match the template's expiry
    'OTP_MAX_ATTEMPTS' => 5,
    'OTP_RESEND_WAIT'  => 30,          // seconds between codes to one number

    // -----------------------------------------------------------------------
    // Rate limits
    // -----------------------------------------------------------------------
    'RATE_PER_IP_HOUR'     => 20,
    'OTP_PER_NUMBER_HOUR'  => 5,

    // -----------------------------------------------------------------------
    // Storage — JSON files, and they MUST live outside public_html.
    //
    // On Hostinger, api/ is inside public_html, so the default lands one level
    // above it. Confirm the absolute path in hPanel's File Manager and set it
    // explicitly if you are unsure:
    //     '/home/uXXXXXXXX/domains/yourdomain.com/benaka-data'
    //
    // booking.php refuses to run if this resolves inside the document root, and
    // writes a deny rule into the directory as a second line of defence.
    // Back this folder up: it is where the bookings are.
    // -----------------------------------------------------------------------
    'DATA_DIR' => __DIR__ . '/../../benaka-data',

    // Timestamps on the owner's message use this zone.
    'TIMEZONE' => 'Asia/Kolkata',

    // -----------------------------------------------------------------------
    // Requests are accepted only from these origins. Scheme and host, no path,
    // no trailing slash. Put BOTH the bare domain and the www one if both
    // resolve, or the form will 403 for half your visitors.
    // -----------------------------------------------------------------------
    'ALLOWED_ORIGINS' => [
        'https://example.com',
        'https://www.example.com',
    ],
];
