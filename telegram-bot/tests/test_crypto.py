import pytest
from cryptography.fernet import Fernet, InvalidToken

from bot.crypto import decrypt, encrypt


def test_ma_hoa_roi_giai_ma_ra_dung_chuoi():
    key = Fernet.generate_key().decode()
    token = encrypt(key, "mat-khau-123")
    assert token != "mat-khau-123"
    assert decrypt(key, token) == "mat-khau-123"


def test_giai_ma_bang_khoa_khac_bao_loi():
    token = encrypt(Fernet.generate_key().decode(), "x")
    with pytest.raises(InvalidToken):
        decrypt(Fernet.generate_key().decode(), token)
