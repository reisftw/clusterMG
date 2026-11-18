alter table approval_requests drop constraint if exists approval_requests_status_check;
alter table approval_requests add constraint approval_requests_status_check
  check (status in ('PENDING','APPROVED','REJECTED','FOLLOW_UP','EXPIRED','CANCELLED','SEND_FAILED'));

alter table approval_decisions drop constraint if exists approval_decisions_decision_check;
alter table approval_decisions add constraint approval_decisions_decision_check
  check (decision in ('APPROVED','REJECTED','FOLLOW_UP'));
