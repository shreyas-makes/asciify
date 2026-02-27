# frozen_string_literal: true

class SharedDraftsController < InertiaController
  skip_before_action :authenticate
  before_action :perform_authentication

  def show
    draft = Draft.find_by(share_token: params[:token].to_s)
    return render file: Rails.public_path.join("404.html"), status: :not_found, layout: false unless draft

    render inertia: "home/index", props: {
      sharedToken: draft.share_token,
      sharedPermission: draft.share_permission
    }
  end
end
