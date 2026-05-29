import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
    token: string;
    user_id: number;
    username: string;
    password: string;
    nickname: string;
    phone: string;
    email: string;
    avatar_url: string;
    created_at: string;
}

const initialState: AuthState = {
    token: "",
    user_id: 0,
    username: "",
    password: "",
    nickname: "",
    phone: "",
    email: "",
    avatar_url: "",
    created_at: "",
};

/**
 * 设置 JWT 信息
 */
export const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        setToken: (state, action: PayloadAction<string>) => {
            state.token = action.payload;
        },
        setName: (state, action: PayloadAction<string>) => {
            state.username = action.payload;
        },
        setPassword: (state, action: PayloadAction<string>) => {
            state.password = action.payload;
        },
        setNickname: (state, action: PayloadAction<string>) => {
            state.nickname = action.payload;
        },
        setPhone: (state, action: PayloadAction<string>) => {
            state.phone = action.payload;
        },
        setEmail: (state, action: PayloadAction<string>) => {
            state.email = action.payload;
        },
        setUserID: (state, action: PayloadAction<number>) => {
            state.user_id = action.payload;
        },
        setProfile: (state, action: PayloadAction<Partial<Omit<AuthState, "token">>>) => {
            state.user_id = action.payload.user_id ?? state.user_id;
            state.username = action.payload.username ?? state.username;
            state.password = action.payload.password ?? state.password;
            state.nickname = action.payload.nickname ?? state.nickname;
            state.email = action.payload.email ?? state.email;
            state.phone = action.payload.phone ?? state.phone;
            state.avatar_url = action.payload.avatar_url ?? state.avatar_url;
            state.created_at = action.payload.created_at ?? state.created_at;
        },
        resetAuth: (state) => {
            state.token = "";
            state.user_id = 0;
            state.username = "";
            state.password = "";
            state.nickname = "";
            state.phone = "";
            state.email = "";
            state.avatar_url = "";
            state.created_at = "";
        },
    },
});

export const { setToken, setName, setPassword, setEmail, setNickname, setPhone, setUserID, setProfile, resetAuth } = authSlice.actions;
export default authSlice.reducer;
