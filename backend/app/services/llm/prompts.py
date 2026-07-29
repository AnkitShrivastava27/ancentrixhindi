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

    base = (
        f"Aap {agent} hain, {company.name} ke liye ek AI phone agent. "
        f"HAMESHA natural Hindi-English mix (Hinglish) mein baat karein.\n"
        f"{gender_grammar_note(getattr(company, 'voice_gender', None))}\n\n"
        f"Company: {company.name}\nVivaran: {desc}\nSevayein: {serv}\n"
    )
    if products_txt:
        base += f"\nProducts:{products_txt}\n"
    if faqs:
        base += f"\nFAQs:\n{faqs}\n"
    if rag_context:
        base += f"\nAdditional context:\n{rag_context}\n"

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
    return base
