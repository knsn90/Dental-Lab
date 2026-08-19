// LabUsersManagement AYNI ZAMANDA SettingsHubScreen + EmployeesScreen tarafından
// STATİK (senkron) import ediliyor. Burada lazyRoute (async import) kullanmak modülü
// yalnız async chunk'a koyup senkron importçularda "Requiring unknown module" → React
// #130 çökmesine yol açıyordu. Bu yüzden route de STATİK re-export olmalı (modül tek,
// senkron bundle'lanır). Kod-bölme kaybı önemsiz; modül zaten Settings ile yükleniyor.
export { LabUsersManagement as default } from '../../modules/admin/users/LabUsersManagement';
