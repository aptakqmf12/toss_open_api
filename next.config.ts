import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // EB/EC2 배포용 자기완결 번들. .next/standalone/server.js 하나로 구동되며
  // node_modules .bin 심링크에 의존하지 않아 zip 배포에서도 안전하다.
  output: "standalone",
};

export default nextConfig;
