import firebase_admin
from firebase_admin import credentials, firestore, auth
import os

def debug_firebase():
    print("🔍 Debugging Firebase Users...")
    
    # Check for service account
    cred_path = "routenizz-firebase-adminsdk-fbsvc-99a088ff46.json"
    if not os.path.exists(cred_path):
        print(f"❌ Service account not found at {cred_path}")
        return

    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    
    print("\n--- Firestore 'users' Collection ---")
    users_ref = db.collection("users")
    docs = users_ref.stream()
    
    found_any = False
    for doc in docs:
        found_any = True
        data = doc.to_dict()
        print(f"ID: {doc.id} | Email: {data.get('email')} | Role: {data.get('role')} | UID: {data.get('uid')}")
    
    if not found_any:
        print("Empty 'users' collection.")

    print("\n--- Firebase Auth Users ---")
    auth_users = auth.list_users().iterate_all()
    for user in auth_users:
        print(f"UID: {user.uid} | Email: {user.email}")

if __name__ == "__main__":
    debug_firebase()
