import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../types/models';

interface AuthState {
  user: AuthUser | null;
  bootstrapping: boolean;
}

const initialState: AuthState = {
  user: null,
  bootstrapping: true,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
    },
    setBootstrapping(state, action: PayloadAction<boolean>) {
      state.bootstrapping = action.payload;
    },
    clearSession(state) {
      state.user = null;
      state.bootstrapping = false;
    },
  },
});

export const { setUser, setBootstrapping, clearSession } = authSlice.actions;
export default authSlice.reducer;
