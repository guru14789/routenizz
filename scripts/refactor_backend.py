import os
import shutil
import re

ROOT_DIR = "/Users/sureshkumar/prime project/tnimpact"

def move_files():
    # 1. Move schemas
    if os.path.exists(os.path.join(ROOT_DIR, "models", "schemas.py")):
        print("Moving models/schemas.py to app/schemas.py")
        shutil.move(os.path.join(ROOT_DIR, "models", "schemas.py"), os.path.join(ROOT_DIR, "app", "schemas.py"))
        # clean up models dir if empty or just containing __init__ and __pycache__
        shutil.rmtree(os.path.join(ROOT_DIR, "models"), ignore_errors=True)

    # 2. Move routing
    if os.path.exists(os.path.join(ROOT_DIR, "routing")):
        print("Moving routing to app/routing")
        if not os.path.exists(os.path.join(ROOT_DIR, "app", "routing")):
            shutil.move(os.path.join(ROOT_DIR, "routing"), os.path.join(ROOT_DIR, "app", "routing"))
        else:
            print("app/routing already exists!")

    # 3. Move ml
    if os.path.exists(os.path.join(ROOT_DIR, "ml")):
        print("Moving ml to app/ml")
        if not os.path.exists(os.path.join(ROOT_DIR, "app", "ml")):
            shutil.move(os.path.join(ROOT_DIR, "ml"), os.path.join(ROOT_DIR, "app", "ml"))
        else:
            print("app/ml already exists!")

    # 4. Move services
    if os.path.exists(os.path.join(ROOT_DIR, "services")):
        print("Moving contents of services to app/services")
        for item in os.listdir(os.path.join(ROOT_DIR, "services")):
            if item == "__pycache__": continue
            s = os.path.join(ROOT_DIR, "services", item)
            d = os.path.join(ROOT_DIR, "app", "services", item)
            if not os.path.exists(d):
                shutil.move(s, d)
        shutil.rmtree(os.path.join(ROOT_DIR, "services"), ignore_errors=True)

def rewrite_imports():
    targets = [
        os.path.join(ROOT_DIR, "app"),
        os.path.join(ROOT_DIR, "tests"),
        os.path.join(ROOT_DIR, "training"),
        os.path.join(ROOT_DIR, "ml_models"),
    ]
    
    replacements = [
        (r'\bfrom models\.schemas\b', 'from app.schemas'),
        (r'\bimport models\.schemas\b', 'import app.schemas'),
        (r'\bfrom routing\b', 'from app.routing'),
        (r'\bimport routing\b', 'import app.routing'),
        (r'\bfrom ml\b', 'from app.ml'),
        (r'\bimport ml\b', 'import app.ml'),
        (r'\bfrom services\b', 'from app.services'),
        (r'\bimport services\b', 'import app.services'),
    ]

    for d in targets:
        if not os.path.exists(d): continue
        for root, dirs, files in os.walk(d):
            for file in files:
                if file.endswith('.py'):
                    filepath = os.path.join(root, file)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    new_content = content
                    for pattern, repl in replacements:
                        new_content = re.sub(pattern, repl, new_content)
                    
                    if new_content != content:
                        print(f"Updated imports in {filepath}")
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(new_content)

if __name__ == "__main__":
    move_files()
    rewrite_imports()
    print("Done refactoring backend structure.")
