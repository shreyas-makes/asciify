# frozen_string_literal: true

class DraftsController < ApplicationController
  skip_before_action :authenticate
  before_action :perform_authentication
  before_action :authenticate, only: %i[claim share share_settings]

  def show
    shared_draft = find_shared_draft_from_params
    if share_token_param_present?
      return render json: {error: "not_found"}, status: :not_found unless shared_draft

      return render json: {
        nodes: shared_draft.payload.fetch("nodes", []),
        version: shared_draft.version,
        permission: shared_draft.share_permission
      }
    end

    draft = find_draft

    if draft
      render json: {
        nodes: draft.payload.fetch("nodes", []),
        version: draft.version
      }
    else
      render json: {
        nodes: [],
        version: 0
      }
    end
  end

  def update
    expected_version = params[:version].to_i
    nodes = normalized_nodes

    shared_draft = find_shared_draft_from_params
    if share_token_param_present?
      return render json: {error: "not_found"}, status: :not_found unless shared_draft
      return render json: {error: "forbidden"}, status: :forbidden unless shared_draft.share_permission == "edit"

      if expected_version != shared_draft.version
        return render json: {
          error: "version_conflict",
          nodes: shared_draft.payload.fetch("nodes", []),
          version: shared_draft.version
        }, status: :conflict
      end

      next_version = shared_draft.version + 1
      updated = Draft.where(id: shared_draft.id, version: expected_version)
        .update_all(payload: {"nodes" => nodes}, version: next_version, updated_at: Time.current)

      if updated.zero?
        latest = Draft.find(shared_draft.id)
        return render json: {
          error: "version_conflict",
          nodes: latest.payload.fetch("nodes", []),
          version: latest.version
        }, status: :conflict
      end

      return render json: {nodes:, version: next_version}
    end

    draft = current_draft_for_write

    if draft.new_record?
      draft.guest_token = ensure_guest_token! unless Current.user
      draft.payload = {"nodes" => nodes}
      draft.version = 1
      draft.save!

      render json: {nodes:, version: draft.version}
      return
    end

    if expected_version != draft.version
      render json: {
        error: "version_conflict",
        nodes: draft.payload.fetch("nodes", []),
        version: draft.version
      }, status: :conflict
      return
    end

    next_version = draft.version + 1
    updated = Draft.where(id: draft.id, version: expected_version)
      .update_all(payload: {"nodes" => nodes}, version: next_version, updated_at: Time.current)

    if updated.zero?
      latest = Draft.find(draft.id)
      render json: {
        error: "version_conflict",
        nodes: latest.payload.fetch("nodes", []),
        version: latest.version
      }, status: :conflict
      return
    end

    render json: {nodes:, version: next_version}
  end

  def claim
    token = cookies.signed[:guest_token]
    if token.blank?
      existing_user_draft = Draft.where(user: Current.user).order(updated_at: :desc).first
      return render json: {status: "already_claimed", version: existing_user_draft.version} if existing_user_draft

      return render json: {status: "no_guest_draft"}
    end

    guest_draft = Draft.for_guest(token).first
    if guest_draft.nil?
      existing_user_draft = Draft.where(user: Current.user).order(updated_at: :desc).first
      return render json: {status: "already_claimed", version: existing_user_draft.version} if existing_user_draft

      return render json: {status: "no_guest_draft"}
    end

    guest_draft.update!(user: Current.user, guest_token: nil)

    render json: {
      status: "claimed",
      version: guest_draft.version
    }
  end

  def share
    draft = current_shareable_draft
    return render json: {error: "no_draft"}, status: :not_found unless draft

    if draft.share_token.blank?
      draft.update!(share_token: generate_share_token)
    end

    render json: {
      status: "ready",
      share_url: share_url_for(draft.share_token),
      permission: draft.share_permission
    }
  end

  def share_settings
    draft = current_shareable_draft
    return render json: {error: "no_draft"}, status: :not_found unless draft
    return render json: {error: "no_share_link"}, status: :unprocessable_entity if draft.share_token.blank?

    permission = params[:permission].to_s
    unless %w[view edit].include?(permission)
      return render json: {error: "invalid_permission"}, status: :unprocessable_entity
    end

    draft.update!(share_permission: permission)

    render json: {
      status: "updated",
      share_url: share_url_for(draft.share_token),
      permission: draft.share_permission
    }
  end

  private

  def find_draft
    if Current.user
      user_draft = Draft.where(user: Current.user).order(updated_at: :desc).first
      return user_draft if user_draft

      token = cookies.signed[:guest_token]
      return unless token.present?

      return Draft.for_guest(token).first
    end

    token = cookies.signed[:guest_token]
    return unless token.present?

    Draft.for_guest(token).first
  end

  def current_draft_for_write
    if Current.user
      user_draft = Draft.where(user: Current.user).order(updated_at: :desc).first
      return user_draft if user_draft

      token = cookies.signed[:guest_token]
      if token.present?
        guest_draft = Draft.for_guest(token).first
        if guest_draft
          guest_draft.update!(user: Current.user, guest_token: nil)
          return guest_draft
        end
      end

      Draft.new(user: Current.user)
    else
      Draft.for_guest(ensure_guest_token!).first_or_initialize
    end
  end

  def current_user_draft
    return unless Current.user

    Draft.where(user: Current.user).order(updated_at: :desc).first
  end

  def current_shareable_draft
    draft = current_user_draft
    return draft if draft

    token = cookies.signed[:guest_token]
    return unless token.present?

    guest_draft = Draft.for_guest(token).first
    return unless guest_draft

    guest_draft.update!(user: Current.user, guest_token: nil)
    guest_draft
  end

  def ensure_guest_token!
    token = cookies.signed[:guest_token]
    return token if token.present?

    token = SecureRandom.hex(24)
    cookies.signed[:guest_token] = {
      value: token,
      expires: 1.year.from_now,
      httponly: true,
      same_site: :lax
    }
    token
  end

  def normalized_nodes
    nodes = params[:nodes]
    return [] unless nodes.is_a?(Array)

    nodes.map do |node|
      node.is_a?(ActionController::Parameters) ? node.permit!.to_h : node
    end
  end

  def share_token_param_present?
    params[:share_token].present?
  end

  def find_shared_draft_from_params
    token = params[:share_token].to_s
    return nil if token.blank?

    Draft.find_by(share_token: token)
  end

  def generate_share_token
    loop do
      token = SecureRandom.urlsafe_base64(18)
      break token unless Draft.exists?(share_token: token)
    end
  end

  def share_url_for(token)
    "#{request.base_url}/shared/#{token}"
  end
end
