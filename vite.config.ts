import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Snowflake 자격 증명과 세션 비밀키는 /api 서버에서만 사용하며 브라우저에 노출하지 않습니다.
  envPrefix: ['VITE_'],
  server: {
    host: 'localhost',
    port: 5173,
  },
});
