from collections import defaultdict
import time


class WebSocketRateLimiter:
    '''
    速率限制器：防止恶意刷屏，每秒钟最多发15条消息，超出警告，警告10次进黑名单
    '''
    def __init__(self, max_messages: int = 15, window_seconds: float = 1.0):
        self.max_messages = max_messages
        self.window_seconds = window_seconds
        self.message_timestamps: dict[int, list[float]] = defaultdict(list)
        self.warning_counts: dict[int, int] = defaultdict(int)
        self.blocked_users: set[int] = set()

    def is_allowed(self, user_id: int) -> bool:
        if user_id in self.blocked_users:
            return False
        now = time.time()
        timestamps = self.message_timestamps[user_id]
        self.message_timestamps[user_id] = [
            t for t in timestamps
            if now - t < self.window_seconds
        ]
        if len(self.message_timestamps[user_id]) >= self.max_messages:
            self.warning_counts[user_id] += 1
            if self.warning_counts[user_id] > 5:
                self.blocked_users.add(user_id)
            return False
        self.message_timestamps[user_id].append(now)
        return True
