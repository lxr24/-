const errorDictionary: Record<string, string> = {
    "Internal Server Error": "服务器开小差了，正在抢修中 🛠️",
    "Not authenticated": "登录已过期，请重新登录",
    "Signature has expired": "登录凭证已过期，请重新登录",
    "User not found": "没有找到该用户",
    // 不够的话后面可以再加
};

export const translateError = (err: any, defaultMsg: string = "操作失败，请稍后再试") => {
    // 如果没有报错信息，直接返回默认提示
    if (!err) return defaultMsg;

    // 提取报错文本 (根据你的后端返回结构，可能是 err.message, err.detail 或纯文本)
    const rawMessage = err.message || err.detail || String(err);
    const status = err.status;

    // 按 HTTP 状态码拦截
    if (status === 500) return "服务器开小差了，请稍后再试 🥲";
    if (status === 422) return "填写的信息格式有误，请检查一下哦 📝";
    if (status === 403) return "抱歉，您暂无此操作的权限 🚫";
    if (status === 404) return "找不到相关信息，可能已被删除";

    // 按字典精确匹配翻译
    if (errorDictionary[rawMessage]) {
        return errorDictionary[rawMessage];
    }

    // 模糊匹配 (拦截那些带变量的、长篇大论的英文)
    if (rawMessage.includes("ECONNREFUSED") || rawMessage.includes("Failed to fetch")) {
        return "网络连接失败，请检查网络或联系管理员 🌐";
    }
    if (rawMessage.includes("Expecting value") || rawMessage.includes("JSON") || rawMessage.includes("Invalid")) {
        return "数据解析失败，请检查网络或刷新页面重试";
    }

	if (rawMessage.includes("您已被移出群聊")){
		return "您已不在当前群聊中，无法发送消息🫂";
	}

    // 如果都没命中，返回兜底的中文提示，也可以把原英文抛出来
	console.log("未翻译的错误信息：", rawMessage);
    return defaultMsg; 
};