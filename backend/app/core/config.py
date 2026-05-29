# /app/app/core/config.py
# pylint: disable=too-few-public-methods

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class Settings:
    def __init__(self):
        # 这里是关键：挂载点是一个目录
        config_dir = os.getenv("CONFIG_PATH", "/app/config")

        def get_config_value(key, default_value):
            # 从目录下的同名文件中读取值
            file_path = Path(config_dir) / key
            if file_path.is_file():
                return file_path.read_text().strip()
            # 如果文件不存在，可以从环境变量或默认值回退
            return os.getenv(key.upper(), default_value)

        # 数据库配置
        self.db_host = get_config_value("db_host", "localhost")
        self.db_port = int(get_config_value("db_port", 3306))
        self.db_user = get_config_value("db_user", "root")
        self.db_password = get_config_value("db_password", "password")
        self.db_name = get_config_value("db_name", "im_db")

        self.test_database_url = get_config_value(
            "test_database_url",
            "sqlite+aiosqlite:////tmp/im_db_test.sqlite3"
        )
        self.database_url = self._build_database_url()

        # JWT配置
        self.jwt_secret_key = get_config_value("jwt_secret_key", "change_this")
        self.jwt_algorithm = get_config_value("jwt_algorithm", "HS256")
        self.jwt_expire_minutes = int(
            get_config_value("jwt_expire_minutes", 1440)
        )

        # 文件上传配置
        self.upload_dir = get_config_value("upload_dir", "/app/uploads")
        self.max_avatar_size = int(
            get_config_value("max_avatar_size", 5 * 1024 * 1024)  # 默认 5 MB
        )

    def _build_database_url(self):
        explicit_database_url = os.getenv("DATABASE_URL")
        if explicit_database_url:
            return explicit_database_url
        if os.getenv("TESTING", "").lower() in ("1", "true", "yes", "on"):
            return self.test_database_url
        return (
            f"mysql+aiomysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()
