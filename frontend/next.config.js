/** @type {import('next').NextConfig} */
const nextConfig = {
    // TODO Start: [Student] Enable standalone build
    output: 'standalone',
    // TODO End
    reactStrictMode: false, /* @note: To prevent duplicated call of useEffect */
    // swcMinify: true,

    async rewrites() {
        return [{
            source: "/api/:path*",
            // 前端只需要请求 /api/xxx 就会被转发到后端的 /xxx 接口

            // 在secoder上用的后端
            destination: "https://Vox-backend-MMJE.app.spring26b.secoder.net/:path*",
            
            // 本地测试时用本地的后端
            // 这里把后端启动在哪了，默认应该就是这个
            // destination: "http://127.0.0.1:8000/:path*",
        }];
    }
};

// eslint-disable-next-line no-undef
module.exports = nextConfig;
