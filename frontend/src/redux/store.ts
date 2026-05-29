// 用于包裹所有的redux保存项，目前只有auth(因为把小作业里的board的状态剔除了)，后续可以继续添加其他的redux保存项
import { configureStore } from "@reduxjs/toolkit";

import authReducer from "./auth";

const store = configureStore({
    reducer: {
        auth: authReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
