"""Stand-in company information, in the shape the post describes: "the information we provide" about the company and
its services, plus the pages already on the website.

Replace these with the real ones. Everything else reads from here. (Stand-in business: a small web and IT services
company.)
"""

PDFS = {}

# The company information the client hands over (a doc, a Notion page, a PDF). file -> text
DOCUMENTS = {
    "company-info.md": (
        "We are a team of 12 developers and designers founded in 2019. "
        "We build and maintain websites and web apps for small and mid-sized businesses. "
        "Our office hours are Monday to Friday, 9 am to 6 pm. "
        "A new project starts with a free 30-minute discovery call."
    ),
    "maintenance-plans.md": (
        "The Basic maintenance plan costs $99 per month and includes security updates and daily backups. "
        "The Pro maintenance plan costs $249 per month and adds 5 hours of changes and a 4-hour response time. "
        "Plans can be cancelled with 30 days notice."
    ),
}

# Website pages (crawled from the existing Next.js site). url path -> text
WEBSITE = {
    "/services": (
        "We design and build business websites, online stores and custom web apps. "
        "We also migrate old websites to Next.js. "
        "Every website we build is mobile-friendly and optimized for speed."
    ),
    "/pricing": (
        "A business website starts at $2,500. "
        "An online store starts at $5,000. "
        "Custom web apps are quoted after the discovery call."
    ),
    "/process": (
        "A typical business website takes 4 to 6 weeks from the discovery call to launch. "
        "You get two rounds of design revisions. "
        "We host on Vercel unless you ask for another host."
    ),
}
