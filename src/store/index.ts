import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import { hrmsApi } from './hrmsApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [hrmsApi.reducerPath]: hrmsApi.reducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(hrmsApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
