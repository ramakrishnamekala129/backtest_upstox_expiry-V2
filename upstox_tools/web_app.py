"""Compatibility shim allowing the FastAPI app to be imported from the package."""

from web_app import app  # noqa: F401 ; expose the root-level FastAPI app

__all__ = ['app']
