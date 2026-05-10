import asyncio
import os
import sys
import bcrypt

# Ensure backend is in path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db.database import async_session, engine, Base
from app.models.db_models import User
from app.core.auth import get_password_hash

async def seed_admin():
    print("🌱 Seeding Default Admin...")
    
    # Initialize DB tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Check if admin already exists in SQLite
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.email == "admin@routenizz.com"))
        existing = result.scalar_one_or_none()
        
        if not existing:
            admin = User(
                email="admin@routenizz.com",
                full_name="System Administrator",
                hashed_password=get_password_hash("Admin@123"),
                role="admin",
                is_active=True
            )
            session.add(admin)
            await session.commit()
            print("✅ Default Admin Created in SQLite!")
        else:
            print("⚠️ Admin already exists in SQLite.")

        # ── SYNC TO FIREBASE AUTH ──
        try:
            import firebase_admin
            from firebase_admin import auth as firebase_auth, firestore
            
            # Initialize Firebase if not already
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            
            f_db = firestore.client()
                
            email = "admin@routenizz.com"
            password = "Admin@123"
            
            user_record = None
            try:
                user_record = firebase_auth.get_user_by_email(email)
                print(f"⚠️ Firebase user {email} already exists. Force updating password...")
                firebase_auth.update_user(
                    user_record.uid,
                    password=password
                )
                print("✅ Firebase password updated.")
            except Exception:
                user_record = firebase_auth.create_user(
                    email=email,
                    password=password,
                    display_name="System Administrator"
                )
                print(f"✅ Firebase user {email} created!")
            
            # Create/Update user document in Firestore 'users' collection
            if user_record:
                user_doc_ref = f_db.collection("users").document(user_record.uid)
                user_doc_ref.set({
                    "uid": user_record.uid,
                    "email": email,
                    "role": "admin",
                    "createdAt": firestore.SERVER_TIMESTAMP
                }, merge=True)
                print(f"✅ Firestore record for {email} created/updated!")
                
        except Exception as f_err:
            print(f"❌ Failed to sync to Firebase: {f_err}")

        print("   Email: admin@routenizz.com")
        print("   Pass:  Admin@123")

if __name__ == "__main__":
    asyncio.run(seed_admin())
