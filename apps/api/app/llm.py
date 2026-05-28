from __future__ import annotations

from openai import OpenAI

from .config import settings


def _require_api_key() -> str:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    return settings.openai_api_key


def _read_prompt(prompt_name: str) -> str:
    path = settings.prompt_dir / prompt_name
    return path.read_text(encoding="utf-8")


def _extract_text(response) -> str:
    if not response.choices:
        raise RuntimeError("No LLM response choices returned.")
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("LLM returned empty content.")
    return content.strip()


def _remove_rewrite_example_section(feedback: str) -> str:
    markers = ("**四、改寫示範**", "四、改寫示範", "### 四、改寫示範", "## 四、改寫示範")
    indexes = [feedback.find(marker) for marker in markers if marker in feedback]
    if not indexes:
        return feedback
    return feedback[: min(indexes)].rstrip()


def generate_case_reply(user_input: str, history: list[dict[str, str]]) -> str:
    client = OpenAI(api_key=_require_api_key())
    system_prompt = _read_prompt("ruth_pcc.txt")
    messages = [{"role": "system", "content": system_prompt}] + history + [
        {"role": "user", "content": user_input}
    ]
    response = client.chat.completions.create(
        model=settings.openai_model_case,
        max_tokens=300,
        messages=messages,
    )
    return _extract_text(response)


def generate_supervision_feedback(history: list[dict[str, str]]) -> str:
    client = OpenAI(api_key=_require_api_key())
    system_prompt = _read_prompt("supervisor_pcc.txt")
    role_labels = {
        "user": "學生/受訓諮商師",
        "assistant": "Ruth/虛擬個案",
        "system": "系統",
    }
    formatted = "\n".join(
        f'[{role_labels.get(m["role"], m["role"])}]: {m["content"]}' for m in history
    )

    response = client.chat.completions.create(
        model=settings.openai_model_supervisor,
        max_tokens=2000,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "請評估以下諮商練習對話。\n"
                    "重要：只評估並引用標記為 [學生/受訓諮商師] 的內容；"
                    "標記為 [Ruth/虛擬個案] 的內容只能作為互動脈絡，不得當作學生原句引用。\n\n"
                    f"{formatted}"
                ),
            },
        ],
    )
    return _remove_rewrite_example_section(_extract_text(response))
