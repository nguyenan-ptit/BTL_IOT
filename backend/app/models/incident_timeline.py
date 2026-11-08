"""The canonical database schema has no incident timeline table.

The API builds its timeline from the existing incident row, incident_receipts,
and measurements. Do not map or create an additional table here.
"""
