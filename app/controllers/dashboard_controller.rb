# frozen_string_literal: true

class DashboardController < InertiaController
  def index
    drafts = Draft.where(user: Current.user).order(updated_at: :desc)

    render inertia: {
      drafts: drafts.map { |draft| serialize_draft(draft) }
    }
  end

  private

  def serialize_draft(draft)
    nodes = draft.payload.is_a?(Hash) ? draft.payload.fetch("nodes", []) : []
    title_source = nodes.find do |node|
      node.is_a?(Hash) && node["label"].is_a?(String) && node["label"].strip.present?
    end

    {
      id: draft.id,
      title: title_source ? title_source["label"].strip : "Untitled drawing",
      updated_at: draft.updated_at,
      version: draft.version,
      node_count: nodes.size,
      share_url: draft.share_token.present? ? shared_draft_url(token: draft.share_token) : nil
    }
  end
end
