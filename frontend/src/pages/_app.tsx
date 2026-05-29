// NOSONAR
// 前端的总外壳，这里写个啥，应用的所有页面都会被他包裹，因此可以放一些全局的组件，比如导航栏，Redux等
import Head from "next/head";
import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import localforage from "localforage";
import store, { RootState } from "../redux/store";
import { resetAuth, setPassword, setProfile, setToken } from "../redux/auth";
import { request } from "../utils/network";
import { BACKEND_URL } from "../constants/string";
// import { resetAuth } from "../redux/auth";
// import { useRouter } from "next/router";

const AuthBootstrap: React.FC = () => {
  const dispatch = useDispatch();
  const token = useSelector((state: RootState) => state.auth.token);
  const userId = useSelector((state: RootState) => state.auth.user_id);

  useEffect(() => { // 只要网页重新启动，就尝试从 localforage 里读取 token，并验证其有效性，恢复登录状态
    let cancelled = false;

    const hydrateAuth = async () => {
      if (token && userId) {
        return;
      }

      const storedToken = await localforage.getItem<string>("token");
      if (!storedToken) {
        return;
      }

      const storedPassword = await localforage.getItem<string>("password");

      dispatch(setToken(storedToken));
      if (storedPassword) {
        dispatch(setPassword(storedPassword));
      }

      try {
        const me = await request(`${BACKEND_URL}/api/auth/me`, "GET", true);
        if (cancelled) {
          return;
        }

  const processedAvatarUrl = me?.avatar_url ? `/api${me.avatar_url}` : "";
  dispatch(setProfile({ ...me, avatar_url: processedAvatarUrl }));

        if (me?.username) {
          await localforage.setItem("username", me.username);
        }
        if (processedAvatarUrl) {
          await localforage.setItem("avatar", processedAvatarUrl);
        }
      } catch {
        if (cancelled) {
          return;
        }

        dispatch(resetAuth());
        await localforage.removeItem("token");
        await localforage.removeItem("username");
        await localforage.removeItem("password");
      }
    };

    void hydrateAuth();

    return () => {
      cancelled = true;
    };
  }, [dispatch, token, userId]);

  return undefined;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
const App = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Head>
        <title>Vox</title>
      </Head>
      <AuthBootstrap />
      <div style={{ padding: 12 }}>
        <Component {...pageProps} />
      </div>
    </>
  );
};

export default function AppWrapper(props: AppProps) {
    return (
        <Provider store={store}>
            <App {...props} />
        </Provider>
    );
    // 这里使用Redux全局状态管理，包裹整个App组件，所有页面都能使用登录状态
}
