export interface ApiAuthPrincipal {
  userId: string;
  email?: string | null;
}

export type RequestWithApiAuth = {
  authPrincipal?: ApiAuthPrincipal;
};
