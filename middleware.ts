import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware() {
    // middleware body (not needed, auth handled by callbacks)
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/create/:path*", "/demo/:path*", "/editor/:path*"],
};
