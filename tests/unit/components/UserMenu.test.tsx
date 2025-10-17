import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserMenu } from "@/components/auth/UserMenu";
import type { User } from "firebase/auth";

const useAuthMock = vi.fn();
const getClientAuthMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/lib/firebase/auth-context", () => ({
  useAuth: () => useAuthMock()
}));

vi.mock("@/lib/firebase/client", () => ({
  getClientAuth: () => getClientAuthMock()
}));

vi.mock("firebase/auth", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args)
}));

describe("UserMenu", () => {
  afterEach(() => {
    useAuthMock.mockReset();
    getClientAuthMock.mockReset();
    signOutMock.mockReset();
  });

  it("renders loading state while authentication is in progress", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: true,
      error: null,
      token: null
    });

    render(<UserMenu />);

    expect(screen.getByText("Checking session…")).toBeInTheDocument();
  });

  it("shows sign-in call to action when unauthenticated", () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      token: null
    });

    render(<UserMenu />);

    expect(screen.getByText("Not signed in")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("renders user info and signs out when requested", async () => {
    const mockAuth = { name: "auth-instance" };

    const mockUser = {
      displayName: "Test User",
      email: "user@example.com",
      photoURL: null
    } as unknown as User;

    useAuthMock.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      token: "token"
    });

    getClientAuthMock.mockReturnValue(mockAuth);
    signOutMock.mockResolvedValue(undefined);

    render(<UserMenu />);

    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith(mockAuth);
    });
  });
});
