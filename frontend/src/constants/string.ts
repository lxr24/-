/**
 * @note 本文件是一个字符串常量文件的示例，较长的常量字符串，如各类提示文字，均可以写在这里
 *       这么做可以提高核心代码可读性，不会因为过长的字符串导致主逻辑代码难以分析
 */
// 后期按需要修改

// 这个留空就行，因为next.js已经定义好了重写规则，实际上前端只需要fetch("/api/xxx")就行了
export const BACKEND_URL = "";

export const CREATE_SUCCESS = "成功创建一个游戏记录";
export const UPDATE_SUCCESS = "成功更新该游戏记录";
export const DELETE_SUCCESS = "成功删除该游戏记录";

export const FAILURE_PREFIX = "网络请求失败：";

export const LOGIN_REQUIRED = "你需要登录才能完成这一操作";
export const LOGIN_SUCCESS_PREFIX = "登录成功，用户名：";
export const LOGIN_FAILED = "登录失败";

export const REGISTER_SUCCESS_PREFIX = "注册成功，用户名：";
export const REGISTER_FAILED = "注册失败";