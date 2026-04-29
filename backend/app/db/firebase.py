import logging
from firebase_admin import firestore, _apps
from app.core.firebase_auth import _firebase_available

logger = logging.getLogger("app.db.firebase")

db = None

if _firebase_available:
    try:
        db = firestore.client()
        logger.info("Firestore client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Firestore client: {e}")
else:
    logger.warning("Firebase not available. Firestore operations will fail.")

def get_firestore_db():
    if db is None:
        logger.warning("Firestore client is NOT initialized. Firebase features will be disabled.")
    return db
