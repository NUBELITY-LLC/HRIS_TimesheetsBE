declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: number;
      userName: string;
      email: string;
      roleId: number;
      roleCode: string;
      mustChangePassword: boolean;
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
