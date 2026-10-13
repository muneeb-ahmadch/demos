"""Stand-in for the predefined PDF documents: the text ingestion extracts, page by page.

Replace these with the real PDFs. Everything else reads from here. (Stand-in: four PDFs of a small project-management
software company: a user guide, pricing, security and support. Not the client's documents.)
"""

# file -> list of pages (page 1 first), as the PDF text extractor returns them
PDFS = {
    "user-guide.pdf": [
        "To create a project, open the dashboard and press New project. "
        "A project can have up to 50 members on the Team plan. "
        "Archived projects are read-only and can be restored at any time.",
        "To export a project, open Settings and choose Export. "
        "Exports are CSV files and include tasks, comments and due dates. "
        "Attachments are not included in the export.",
    ],
    "pricing.pdf": [
        "The Starter plan is free for up to 3 users. "
        "The Team plan costs 12 euros per user per month, billed annually. "
        "Monthly billing on the Team plan costs 15 euros per user.",
        "You can cancel at any time from the Billing page. "
        "Annual plans are refunded pro rata within the first 30 days only.",
    ],
    "security.pdf": [
        "All data is stored in data centres in the European Union. "
        "Data is encrypted at rest with AES-256 and in transit with TLS 1.2 or higher.",
        "Single sign-on with SAML is available on the Enterprise plan. "
        "An admin can require two-factor authentication for every member.",
    ],
    "support-policy.pdf": [
        "Support is available Monday to Friday, 9:00 to 18:00 Central European Time. "
        "Team plan customers get a first reply within 8 business hours.",
        "Deleted projects stay in the trash for 30 days and can be restored by an admin. "
        "After 30 days they are deleted permanently.",
    ],
}
