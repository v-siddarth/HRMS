export type AuthStackParamList = {
  Login: undefined;
};

export type AdminTabParamList = {
  Home: undefined;
  Shops: undefined;
  Status: undefined;
  Profile: undefined;
};

export type AdminShopsStackParamList = {
  ShopsList: undefined;
  CreateShop: undefined;
  EditShop: { shopId: string };
};

export type AdminDrawerParamList = {
  AdminHome: undefined;
  AdminProfile: undefined;
};

export type ShopTabParamList = {
  Home: undefined;
  Staff: undefined;
  Attendance: undefined;
  Salary: undefined;
  Reports: undefined;
};

export type StaffTabParamList = {
  Home: undefined;
  Attendance: undefined;
  Salary: undefined;
  Profile: undefined;
};

export type ShopDrawerParamList = {
  ShopHome: undefined;
  ShopProfile: undefined;
  ShopSettings: undefined;
  ShopSupport: undefined;
};
