const LIST_PROTOCOLS_SQL = `select count(*) over() total_count,p.*,
	 requester.display_name requester_name,target.display_name target_name,current_user.display_name current_name
	 from retorninho_protocols p
	 left join app_users requester on requester.uid=p.requester_user_uid
	 left join app_users target on target.uid=p.target_user_uid
	 left join app_users current_user on current_user.uid=p.current_user_uid
	 where ($1::text='' or p.status=$1::text)
	 and ($2::text='' or p.type=$2::text)
	 and ($3::text='' or p.protocol_number ilike $4::text or coalesce(p.service_order_number,'') ilike $4::text)
	 order by p.created_at desc,p.id desc limit $5 offset $6`;

const LIST_QUEUE_SQL = `select count(*) over() total_count,id,kind event_type,status,attempts,$1::int max_attempts,
	 next_attempt_at,last_error,created_at,completed_at as processed_at
	 from retorninho_queue where ($2::text='' or status=$2::text)
	 order by created_at desc,id desc limit $3 offset $4`;

module.exports = {
	LIST_PROTOCOLS_SQL,
	LIST_QUEUE_SQL,
};
