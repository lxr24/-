/**
 * @note 本文件是一个网络请求 wrapper 示例，其作用是将所有网络请求汇总到一个函数内处理
 *       我们推荐你在大作业中也尝试写一个网络请求 wrapper，本文件可以用作参考
 */

import store from "../redux/store";

export enum NetworkErrorType {
    UNAUTHORIZED,
    REJECTED,
    CORRUPTED_RESPONSE,
    UNKNOWN_ERROR,
}

export class NetworkError extends Error {
    type: NetworkErrorType;
    // message: string;

    constructor(
        _type: NetworkErrorType,
        _message: any,
    ) {
        const finalMessage = typeof _message === 'string' ? _message : JSON.stringify(_message);

        super(finalMessage);

        this.type = _type;
        this.message = finalMessage;

        Object.setPrototypeOf(this, NetworkError.prototype);
    }

    toString(): string { return this.message; }
    valueOf(): string { return this.message; }
}

interface BackendDetailItem {
    loc?: (string | number)[];
    msg?: string;
    type?: string;
}

const formatBackendDetail = (detail: unknown): string | undefined => {
    if (!Array.isArray(detail) || detail.length === 0) {
        return undefined;
    }

    return detail
        .map((item) => {
            const current = item as BackendDetailItem;
            const loc = Array.isArray(current.loc) ? current.loc.join(" -> ") : "unknown";
            const msg = current.msg || "unknown error";
            const type = current.type ? ` (${current.type})` : "";
            return `${loc}: ${msg}${type}`;
        })
        .join(" | ");
};

const extractBackendErrorMessage = (data: any, fallback = "请求失败"): string => {
    let msg = fallback;
    
    if (typeof data === "string") {
        msg = data;
    } else if (data && typeof data === "object") {
        msg = data.info
            || formatBackendDetail(data.detail)
            || (typeof data.detail === "string" ? data.detail : undefined)
            || data.message
            || (data.type !== undefined ? `错误代码: ${data.type}` : fallback);
    }

    // --- 🤖 智能翻译拦截区 ---
    if (msg.includes("Not authenticated") || msg.includes("Signature has expired")) return "登录已过期，请重新登录";
    if (msg.includes("User not found")) return "哎呀，找不到相关联的用户";
    if (msg.includes("ECONNREFUSED") || msg.includes("Failed to fetch")) return "网络连接失败，请检查网络是否通畅 🌐";
    if (msg.includes("Expecting value") || msg.includes("JSON") || msg.includes("Invalid")) return "数据解析失败，请刷新页面重试";
    
    return msg; // 如果没匹配到，返回原本的报错
};

export const request = async (
    url: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    needAuth: boolean,
    body?: object | FormData,
) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const headers: HeadersInit = {
        ...(isFormData ? {} : { "Content-Type": "application/json" }), //告诉后端这是个json格式的请求体
    };

    if (needAuth) {
        const token = store.getState().auth.token; //在组件外部直接访问 Redux store 获取 token 信息的方法

        if (token) {
            // 如果 token 已经包含 Bearer 前缀，则直接使用；否则添加 Bearer 前缀。
            headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
        }
    }

    // alert(`请求 URL: ${url}\n请求方法: ${method}\n请求体: ${body ? JSON.stringify(body) : "无"}\n请求头: ${JSON.stringify(headers)}`); // Debug
    
    const response = await fetch(url, {
        method,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
        // Step 4 BEGIN
        headers,
        // Step 4 END
    });

    if (!response.ok) {
        // 特别处理 500 错误，直接跳过 JSON 解析，因为 500 通常返回的是 HTML
        if (response.status === 500) {
            throw new NetworkError(NetworkErrorType.UNKNOWN_ERROR, "服务器开小差了，请稍后再试");
        }
        if (response.status === 422) {
            throw new NetworkError(NetworkErrorType.UNKNOWN_ERROR, "提交的信息格式有误，请检查一下哦 📝");
        }

        // 尝试解析错误信息，若失败则给个默认值
        let errorData: any = {};
        try {
            errorData = await response.json();
        } catch {
            throw new NetworkError(
                NetworkErrorType.UNKNOWN_ERROR, 
                `请求处理异常 (HTTP ${response.status})`
            );
        }

        const errorMsg = extractBackendErrorMessage(errorData, `请求失败 (HTTP ${response.status})`);
        const code = Number(errorData.code);
        if (response.status === 401) {
            throw new NetworkError(code === 2 ? NetworkErrorType.UNAUTHORIZED : NetworkErrorType.CORRUPTED_RESPONSE, errorMsg);
        }
        if (response.status === 403) {
            throw new NetworkError(code === 3 ? NetworkErrorType.REJECTED : NetworkErrorType.CORRUPTED_RESPONSE, errorMsg);
        }
        
        throw new NetworkError(NetworkErrorType.UNKNOWN_ERROR, errorMsg);
    }

    if (response.status === 204) return undefined;

    try {
        const data = await response.json();
        
        // 如果后端虽然 HTTP 是 200，但业务 code 报错了
        if (data.code !== undefined && Number(data.code) !== 0) {
            throw new NetworkError(
                NetworkErrorType.CORRUPTED_RESPONSE,
                extractBackendErrorMessage(data, "操作失败")
            );
        }
        return data; // 一切正常，返回数据
    } catch (e : any ){
        if (e instanceof NetworkError) throw e;
        // 如果是纯纯的 JSON 解析报错
        throw new NetworkError(NetworkErrorType.CORRUPTED_RESPONSE, "服务器返回了无法解析的数据结构");
    }
};