from typing import Self

from app.schemas.common import OutputModel
from app.services.importer import ImportReport, reason_label


class ImportIssueOut(OutputModel):
    line: int
    episode_id: str | None
    code: str
    message: str


class ImportReasonOut(OutputModel):
    code: str
    label: str
    count: int


class ImportReportOut(OutputModel):
    processed: int
    imported: int
    skipped_duplicates: int
    rejected: int
    # Imported rows that needed whitespace/case/date-layout normalisation.
    normalized: int
    blank_lines: int
    reasons: list[ImportReasonOut]
    # Rejected rows (the first 200, by line number).
    issues: list[ImportIssueOut]
    issues_truncated: bool

    @classmethod
    def from_report(cls, report: ImportReport) -> Self:
        return cls(
            processed=report.processed,
            imported=report.imported,
            skipped_duplicates=report.skipped_duplicates,
            rejected=report.rejected,
            normalized=report.normalized,
            blank_lines=report.blank_lines,
            reasons=[
                ImportReasonOut(code=code, label=reason_label(code), count=count)
                for code, count in report.reasons.most_common()
            ],
            issues=[ImportIssueOut.model_validate(issue) for issue in report.issues],
            issues_truncated=report.issues_truncated,
        )
