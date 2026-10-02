"""Text normalisation shared by the CSV importer and the API, so both agree on task names."""


def collapse_whitespace(value: str) -> str:
    """Trim and collapse any run of whitespace (spaces, tabs, newlines) to one space."""
    return " ".join(value.split())


def normalize_task_name(value: str) -> str:
    """Task names are case-insensitive: "  Pick Cup " and "PICK CUP" are both "pick cup"."""
    return collapse_whitespace(value).lower()
