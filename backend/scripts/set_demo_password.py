
from getpass import getpass
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import hash_password


def main():
    username = input("Username cần cập nhật: ").strip()
    password = getpass("Nhập mật khẩu mới: ")

    if not password:
        print("Mật khẩu không được để trống.")
        return

    db: Session = SessionLocal()

    try:
        user = (
            db.query(User)
            .filter(User.username == username)
            .first()
        )

        if user is None:
            print("Không tìm thấy tài khoản.")
            return

        user.password_hash = hash_password(password)
        db.commit()

        print(f"Đã cập nhật mật khẩu cho {username}.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
