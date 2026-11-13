"""Stand-in support content in the shape the post names: FAQs, help articles and product documents.

Replace these with the real ones. Everything else reads from here. (Stand-in business: a small online store selling
smart home plugs.)
"""

PDFS = {
    "product-manual-smartplug.pdf": (
        "The Smart Plug works with Alexa and Google Home. "
        "To reset the plug, hold the power button for 10 seconds until the light blinks red. "
        "The plug supports devices up to 15 amps."
    ),
}

# FAQs and help articles (the knowledge base). id -> text
DOCUMENTS = {
    "faq-orders.md": (
        "Orders ship within 1 business day. "
        "Standard delivery takes 3 to 5 business days. "
        "You can track your order with the link in your shipping email."
    ),
    "faq-returns.md": (
        "You can return any product within 30 days for a full refund. "
        "Refunds go back to your original payment method within 5 business days of us receiving the return."
    ),
    "help-wifi-setup.md": (
        "The Smart Plug only connects to 2.4 GHz Wi-Fi networks. "
        "If setup fails, move the plug closer to your router and try again."
    ),
    "help-warranty.md": (
        "Every product has a 1-year warranty against defects. "
        "To claim the warranty, send us your order number and a short video of the problem."
    ),
}

WEBSITE = {}
