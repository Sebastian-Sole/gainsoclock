import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

const providers: Parameters<typeof convexAuth>[0]["providers"] = [Password];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

providers.push(
  Apple({
    profile: (appleInfo) => {
      const name = appleInfo.user
        ? `${appleInfo.user.name.firstName} ${appleInfo.user.name.lastName}`
        : undefined;
      return {
        id: appleInfo.sub,
        name: name,
        email: appleInfo.email,
      };
    },
  }),
);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    async redirect({ redirectTo }) {
      return redirectTo;
    },
  },
});
