import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export { auth, firestore };

export const nowIso = () => new Date().toISOString();

export const adminsCol = () => firestore().collection('admins');
export const shopsCol = () => firestore().collection('shops');
export const shopDoc = (shopId: string) => shopsCol().doc(shopId);
export const managersCol = (shopId: string) => shopDoc(shopId).collection('managers');
export const employeesCol = (shopId: string) => shopDoc(shopId).collection('employees');
export const employeeDoc = (shopId: string, employeeId: string) => employeesCol(shopId).doc(employeeId);
export const attendanceCol = (shopId: string) => shopDoc(shopId).collection('attendance');
export const salaryCol = (shopId: string) => shopDoc(shopId).collection('salary');
export const advancesCol = (shopId: string) => shopDoc(shopId).collection('advances');
export const shiftsCol = (shopId: string) => shopDoc(shopId).collection('shifts');
export const payrollSettingsDoc = (shopId: string) => shopDoc(shopId).collection('settings').doc('payroll');
export const biometricSettingsDoc = (shopId: string) => shopDoc(shopId).collection('settings').doc('biometric');
