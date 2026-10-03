"""Stand-in business data in the three shapes the post names: documents, website content, database records.

Replace these with the real ones. Everything else reads from here. (Stand-in company: a small scheduling SaaS.)
"""

# Uploaded documents (what the admin panel would ingest: PDFs, DOCX). id -> text
DOCUMENTS = {
    "refund-policy.pdf": (
        "Annual plans can be refunded in full within 14 days of purchase. "
        "After 14 days, annual plans are refunded pro rata for the unused full months. "
        "Monthly plans are not refunded, but you can cancel any time and keep access until the end of the paid month."
    ),
    "data-processing-agreement.pdf": (
        "Customer data is stored in the EU, in Frankfurt. "
        "Backups are kept for 30 days and then deleted. "
        "We act as data processor under GDPR; the customer is the data controller."
    ),
    "onboarding-guide.pdf": (
        "You can import contacts from a CSV file of up to 10,000 rows. "
        "Larger files must be split before upload. "
        "Each staff member connects their own calendar during setup."
    ),
}

# Website content (crawled pages). url path -> text
WEBSITE = {
    "/pricing": (
        "Starter is free for up to 2 staff members. "
        "Pro costs $19 per staff member per month. "
        "Business costs $39 per staff member per month and adds single sign-on. "
        "Paying annually gives two months free."
    ),
    "/integrations": (
        "Bookings sync both ways with Google Calendar and Outlook. "
        "Payments at booking are taken through Stripe. "
        "New customers can be added to a Mailchimp list automatically."
    ),
    "/support": (
        "Support is open Monday to Friday, 9:00 to 18:00 GMT. "
        "Live chat support is included on Pro and Business."
    ),
}

# Database records (MySQL/PostgreSQL rows). Exact lookups go here, never to the model.
ACCOUNTS = {
    "ACC-1042": {"plan": "Pro", "staff_seats": 6, "renews": "12 November 2026", "status": "active"},
    "ACC-1187": {"plan": "Business", "staff_seats": 14, "renews": "3 January 2027", "status": "active"},
    "ACC-1203": {"plan": "Starter", "staff_seats": 2, "renews": "n/a (free plan)", "status": "active"},
}
INVOICES = {
    "INV-2291": {"account": "ACC-1042", "amount_usd": 114, "issued": "1 October 2026", "status": "paid"},
    "INV-2304": {"account": "ACC-1187", "amount_usd": 546, "issued": "1 October 2026", "status": "unpaid, due 15 October 2026"},
}
