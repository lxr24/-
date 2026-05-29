// index中好友列表用到的好友类型
export interface FriendItem {
  user_id: number;
  username: string;
  nickname: string;
  [key: string]: any;
}