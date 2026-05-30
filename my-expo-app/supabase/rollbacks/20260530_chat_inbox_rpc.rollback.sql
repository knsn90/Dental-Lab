-- Rollback: 20260530_chat_inbox_rpc.sql
-- Çalıştırdıktan sonra chatApi.ts'deki fetchOrderChatInbox'ı da eski haline döndür.

DROP FUNCTION IF EXISTS get_chat_inbox(UUID);
