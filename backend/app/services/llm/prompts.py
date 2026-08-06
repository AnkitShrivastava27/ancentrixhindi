"""
Shared Hindi/Hinglish system-prompt builder — used by both the XML
Gather webhook flow (vobiz_webhook.py) and the low-latency WebSocket
streaming pipeline (vobiz_stream_pipeline.py). Extracted to its own
module so neither of those two needs to import the other.
"""
from typing import Any


def gender_grammar_note(voice_gender: str) -> str:
    """
    Hindi verbs conjugate by the SPEAKER's gender for first-person forms —
    unlike English, this is grammatically load-bearing, not stylistic.
    A male-voiced TTS saying "main kar rahi hoon" (feminine form) or a
    female-voiced TTS saying "main kar raha hoon" (masculine form) sounds
    immediately wrong/uncanny to a Hindi speaker. Since the LLM has no way
    to infer the TTS voice's gender on its own, we tell it explicitly and
    give a few concrete verb-pair examples so it applies the pattern
    consistently rather than guessing turn to turn.
    """
    gender = (voice_gender or "female").lower()
    if gender == "male":
        return (
            "\nIMPORTANT — aapki awaaz ek MALE voice hai. Hindi mein pehle-purush "
            "(main) ke kriyaon ka MASCULINE roop hamesha istemal karein:\n"
            "  bol raha hoon (NOT bol rahi hoon) | kar raha hoon (NOT kar rahi hoon) | "
            "de sakta hoon (NOT de sakti hoon) | samajh gaya (NOT samajh gayi)\n"
            "Kabhi bhi feminine kriya roop (rahi/sakti/gayi/hui) apne baare mein use na karein."
        )
    return (
        "\nIMPORTANT — aapki awaaz ek FEMALE voice hai. Hindi mein pehle-purush "
        "(main) ke kriyaon ka FEMININE roop hamesha istemal karein:\n"
        "  bol rahi hoon (NOT bol raha hoon) | kar rahi hoon (NOT kar raha hoon) | "
        "de sakti hoon (NOT de sakta hoon) | samajh gayi (NOT samajh gaya)\n"
        "Kabhi bhi masculine kriya roop (raha/sakta/gaya/hua) apne baare mein use na karein."
    )


def build_hindi_prompt(company: Any, lead: Any, rag_context: str, mode: str) -> str:
    agent = company.agent_name or "Aria"
    desc  = company.description_hi or company.description or ""
    serv  = company.services_hi or company.services or ""
    faqs  = company.faqs_hi or company.faqs or ""

    products_txt = ""
    for p in (company.products or []):
        name  = p.get("name_hi")  or p.get("name", "")
        pdesc = p.get("description_hi") or p.get("description", "")
        price = p.get("price", "")
        feats = p.get("features_hi") or p.get("features") or []
        products_txt += f"\n- {name} ({price}): {pdesc}"
        if feats:
            products_txt += f" | Features: {', '.join(feats)}"

    # Default persona: a real, experienced professional — not a generic
    # "AI phone agent." A company can still fully redefine this via their
    # own custom prompt below (e.g. "senior sales manager, 20 years
    # experience"), but the out-of-the-box tone should already sound
    # confident and competent rather than like a script-reader, since most
    # companies won't write a custom prompt at all.
    role_word = "sales executive" if mode == "sales" else "customer support specialist"
    base = (
        f"Aap {agent} hain, {company.name} ke ek experienced aur confident "
        f"{role_word} — aap apna kaam achhi tarah jaante hain aur naturally, "
        f"knowledgeably baat karte hain, kisi script padhne wale AI ki tarah nahi. "
        f"HAMESHA natural Hindi-English mix (Hinglish) mein baat karein.\n"
        f"{gender_grammar_note(getattr(company, 'voice_gender', None))}\n\n"
        f"Company: {company.name}\nVivaran: {desc}\nSevayein: {serv}\n"
    )
    if products_txt:
        base += f"\nProducts:{products_txt}\n"
    if faqs:
        # Merely including the FAQ text wasn't enough on its own to
        # guarantee the model actually reaches for it — an explicit
        # instruction makes retrieval-from-context deliberate rather than
        # incidental, and the "don't invent details" line stops it from
        # fabricating an answer when a question falls outside this list.
        base += (
            f"\nFAQs — caller ke sawaal is list se directly match ho toh "
            f"ISI jawab ko use karein, apni taraf se mat banayein:\n{faqs}\n"
        )
    if rag_context:
        base += f"\nAdditional context:\n{rag_context}\n"

    # Custom instructions from Settings → System Prompt. These were being
    # saved to Company.inbound_system_prompt / outbound_sales_prompt but
    # never actually read anywhere in this function — whatever the user
    # typed there (specific qualifying questions, tone guidance, things to
    # avoid saying, persona/experience-level overrides, etc.) never
    # reached the model. Appended rather than replacing `base`, since the
    # auto-generated company/product/FAQ context above is still needed —
    # this is additional instruction on top of that, not a full
    # replacement of it. Because it's appended LAST, a company's custom
    # prompt can override the default persona/tone set above simply by
    # stating a different one explicitly.
    custom_prompt = (
        getattr(company, "outbound_sales_prompt", None) if mode == "sales"
        else getattr(company, "inbound_system_prompt", None)
    )

    if mode == "sales":
        ln = getattr(lead, "name", None) or ""
        base += (
            f"\nOutbound sales call. Lead: {ln or 'pata nahi'}. "
            f"Product pitch karein, interest judge karein. "
            f"Jawab CHHOTE rakhein — jaise real phone call."
        )
    else:
        base += (
            f"\nInbound support call. Sawaal ka seedha jawab dein. CHHOTA rakhein."
        )

    if custom_prompt and custom_prompt.strip():
        base += f"\n\nAdditional instructions from the business:\n{custom_prompt.strip()}"

    return base
