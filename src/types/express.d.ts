declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: number;
      userName: string;
      email: string;
      roleId: number;
      roleCode: string;
      mustChangePassword: boolean;
      permissions?: string[];
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
