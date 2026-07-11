import { DesignApprovalInbox } from '../../modules/approvals/DesignApprovalInbox';

export default function ClinicApprovalsRoute() {
  return <DesignApprovalInbox routePrefix="/(clinic)" />;
}
