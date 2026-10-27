"""Stand-in business content in the three shapes the post names: PDFs, documents (the knowledge base) and website content.

Replace these with the real ones. Everything else reads from here. (Stand-in business: a small online skincare shop.)
"""

# PDFs (what ingestion would extract text from). file -> text
PDFS = {
    "returns-policy.pdf": (
        "Unopened products can be returned within 30 days of delivery for a full refund. "
        "Opened products can be returned within 14 days if you had a reaction, and we refund them as store credit. "
        "Return shipping is free with the prepaid label in your order email."
    ),
    "ingredient-guide.pdf": (
        "The Vitamin C Serum is fragrance-free and contains 15% vitamin C. "
        "The Night Cream contains retinol and is meant for evening use only. "
        "All products are vegan and cruelty-free."
    ),
}

# Documents (the knowledge base: DOCX, Google Docs). file -> text
DOCUMENTS = {
    "shipping-faq.docx": (
        "You can change the address on your order within 2 hours of placing it by replying to the confirmation email. "
        "After 2 hours the order is packed and the address cannot be changed. "
        "Lost parcels are reshipped once the carrier confirms the loss."
    ),
    "wholesale-terms.docx": (
        "The minimum wholesale order is 24 units per product. "
        "Wholesale prices are 50% off retail. "
        "Wholesale invoices are due within 30 days."
    ),
}

# Website content (crawled pages). url path -> text
WEBSITE = {
    "/shipping": (
        "Orders within the US arrive in 3 to 5 business days. "
        "Shipping is free on US orders over $50. "
        "We also ship to Canada and the UK, in 7 to 12 business days."
    ),
    "/about": (
        "We are a small skincare brand that makes every product in small batches. "
        "Our customer team answers messages Monday to Friday."
    ),
    "/products/vitamin-c-serum": (
        "The Vitamin C Serum costs $38 for 30 ml. "
        "Use two drops every morning before sunscreen. "
        "Store it away from direct sunlight."
    ),
}
