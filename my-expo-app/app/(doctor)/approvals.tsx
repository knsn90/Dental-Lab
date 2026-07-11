import { DesignApprovalInbox } from '../../modules/approvals/DesignApprovalInbox';

export default function DoctorApprovalsRoute() {
  return <DesignApprovalInbox routePrefix="/(doctor)" />;
}
